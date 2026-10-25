"use server"

import { ForgotPasswordInput, forgotPasswordSchema, SignInInput, SignInSchema, SignUpInput, SignUpSchema, SetPasswordInput, SetPasswordSchema } from "../schemas/authSchema";

export async function signUpAction(input: SignUpInput) {
    const data = SignUpSchema.safeParse(input)

    if(!data.success) {
        return {
            success: '',
            error: 'Hubo un error'
        }
    }

    // const response = await
}

export async function signInAction(input: SignInInput) {
    const data = SignInSchema.safeParse(input)
    
    if(!data.success) {
        return {
            success: '',
            error: 'Hubo un error'
        }
    }
    
    // const response = await authService.login(data.data)
    // return response
}