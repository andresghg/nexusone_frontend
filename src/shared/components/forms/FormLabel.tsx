import { LabelHTMLAttributes } from "react"

type Props = LabelHTMLAttributes<HTMLLabelElement>

export default function FormLabel(props : Props) {
  return (
    <label className="block font-medium text-sm" {...props}>{props.children}</label>
  )
}