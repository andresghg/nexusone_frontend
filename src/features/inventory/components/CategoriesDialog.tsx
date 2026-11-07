'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from '../action/category-action'
import type { CategoryRow } from '../types/inventory'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  categories: CategoryRow[]
}

export function CategoriesDialog({ open, onOpenChange, organizationId, categories }: Props) {
  const [pending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)

  // Corre una acción y avisa el resultado; `onDone` solo se ejecuta si salió bien
  const run = (
    action: () => Promise<{ error: string; success: string }>,
    onDone?: () => void,
  ) =>
    startTransition(async () => {
      const { error, success } = await action()
      if (error) {
        toast.error(error)
        return
      }
      toast.success(success)
      onDone?.()
    })

  const create = () => {
    const name = newName.trim()
    if (!name) return
    run(() => createCategoryAction({ organizationId, name }), () => setNewName(''))
  }

  const saveRename = (category: CategoryRow) => {
    const name = editingName.trim()
    if (!name || name === category.name) {
      setEditingId(null)
      return
    }
    run(
      () => renameCategoryAction({ organizationId, categoryId: category.id, name }),
      () => setEditingId(null),
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorías</DialogTitle>
            <DialogDescription>Agrupa tus productos para encontrarlos más rápido.</DialogDescription>
          </DialogHeader>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nueva categoría"
              aria-label="Nombre de la nueva categoría"
              maxLength={80}
            />
            <Button type="submit" disabled={pending || !newName.trim()}>
              Agregar
            </Button>
          </form>

          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no tienes categorías.</p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                  {editingId === category.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveRename(category)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                        aria-label={`Nuevo nombre para ${category.name}`}
                        maxLength={80}
                        className="h-8"
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => saveRename(category)}
                        aria-label="Guardar nombre"
                      >
                        <Check aria-hidden />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancelar edición"
                      >
                        <X aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{category.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {category.productCount} {category.productCount === 1 ? 'producto' : 'productos'}
                        </p>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(category.id)
                          setEditingName(category.name)
                        }}
                        aria-label={`Renombrar ${category.name}`}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDeleting(category)}
                        aria-label={`Eliminar ${category.name}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la categoría {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.productCount > 0
                ? `Sus ${deleting.productCount} productos no se borran: quedarán sin categoría.`
                : 'La categoría no tiene productos.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) {
                  run(() => deleteCategoryAction({ organizationId, categoryId: deleting.id }))
                }
                setDeleting(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
