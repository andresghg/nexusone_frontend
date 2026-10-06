import z from "zod";

export const BaseAuthSchema = z.object({
  name: z.string().trim().min(1, {error : 'El nombre no puede ir vacio'}),
  email: z.email({error : 'El E-mail no es valido'}),
  password: z.string().trim().min(8, {error : 'La contraseña debe tener al menos 8 caracteres'}),
  passwordConfirmation: z.string().trim().min(1, {error : 'El password de confirmacion no puede ir vacio'}),
  newPassword: z.string().trim().min(8, {error : 'La contraseña debe tener al menos 8 caracteres'}),
});

export const SignInSchema = BaseAuthSchema.pick({
  email: true
}).extend({
  password: z.string().trim().min(1, {error : 'La contraseña no puede ir vacia'}),
});

export const SignUpSchema = BaseAuthSchema.pick({
  name: true,
  email: true,
  password: true,
  passwordConfirmation: true,
}).refine((data) => data.password === data.passwordConfirmation, {
  error: 'Las contraseñas no coinciden',
  path: ['passwordConfirmation'],
});

export const forgotPasswordSchema = BaseAuthSchema.pick({
  email: true,
});

export const SetPasswordSchema = BaseAuthSchema.pick({
  newPassword: true,
  passwordConfirmation: true,
}).refine((data) => data.newPassword === data.passwordConfirmation, {
  error: 'Las contraseñas no coinciden',
  path: ['passwordConfirmation'],
});


export type SignUpInput = z.infer<typeof SignUpSchema>
export type SignInInput = z.infer<typeof SignInSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>