'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Form, FormInput, FormLabel, FormSubmit, FormErrors } from '@/shared/components/forms'
import { OrganizationSchema, type OrganizationInput } from '../schemas/organizationSchema'
import { createOrganizationAction, updateOrganizationAction } from '../action/organization-action'
import type { OrganizationWithRole } from '../services/OrganizationRepository'

type Props = { organization: OrganizationWithRole | null }

export function OrganizationForm({ organization }: Props) {
  const router = useRouter()
  const isEdit = !!organization
  const canEdit = !organization || organization.role === 'owner'

  const FIELDS = [
    { name: 'name', label: 'Nombre comercial', placeholder: 'Mi empresa' },
    { name: 'legalName', label: 'Razón social', placeholder: 'Mi Empresa SpA' },
    { name: 'taxId', label: 'RUT', placeholder: '76.123.456-7' },
    { name: 'businessActivity', label: 'Giro', placeholder: 'Comercio al por menor' },
    { name: 'address', label: 'Dirección', placeholder: 'Av. Principal 123' },
    { name: 'commune', label: 'Comuna', placeholder: 'Puerto Montt' },
    { name: 'region', label: 'Región', placeholder: 'Los Lagos' },
    { name: 'phone', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
    { name: 'contactEmail', label: 'Correo de contacto', placeholder: 'contacto@empresa.cl' },
  ] as const

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OrganizationInput>({
    resolver: zodResolver(OrganizationSchema),
    defaultValues: {
    name: organization?.name ?? '',
    legalName: organization?.legalName ?? '',
    taxId: organization?.taxId ?? '',
    businessActivity: organization?.businessActivity ?? '',
    address: organization?.address ?? '',
    commune: organization?.commune ?? '',
    region: organization?.region ?? '',
    phone: organization?.phone ?? '',
    contactEmail: organization?.contactEmail ?? '',
  },
  })

  const onSubmit = async (data: OrganizationInput) => {
  if (organization) {
    const { error, success } = await updateOrganizationAction({ ...data, organizationId: organization.id })
    if (error) {
      toast.error(error)
      return
    }
    toast.success(success)
    router.refresh()
    return
  }

  const { error, success, slug } = await createOrganizationAction(data)
  if (error) {
    toast.error(error)
    return
  }
  toast.success(success)
  router.replace(`/dashboard/${slug}`)
  router.refresh()
}

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEdit ? 'Datos de tu empresa' : 'Registra tu empresa para comenzar a usar NexusOne'}
        </p>

        {!isEdit && (
          <p className="text-sm text-muted-foreground">
            ¿Te invitaron a una empresa? Abre el enlace de invitación que recibiste en lugar de registrar una nueva.
          </p>
        )}
      </div>

      <Form onSubmit={handleSubmit(onSubmit)}>
        {FIELDS.map((f) => (
          <div key={f.name} className="space-y-2">
            <FormLabel htmlFor={f.name}>{f.label}</FormLabel>
            <FormInput {...register(f.name)} id={f.name} disabled={!canEdit} placeholder={f.placeholder} />
            {errors[f.name] && <FormErrors>{errors[f.name]?.message}</FormErrors>}
          </div>
        ))}
        {canEdit && (
          <FormSubmit value={isEdit ? 'Guardar cambios' : 'Registrar empresa'} disabled={isSubmitting} />
        )}
      </Form>
    </div>
  )
}