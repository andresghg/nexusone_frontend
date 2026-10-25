"use server"

import { authService } from "../services/AuthService";
import { SignInInput, SignInSchema, SignUpInput, SignUpSchema } from "../schemas/authSchema";

export async function signUpAction(input: SignUpInput) {
    const data = SignUpSchema.safeParse(input)

    if(!data.success) {
        return {
            success: '',
            error: 'Hubo un error'
        }
    }

    const response = await authService.register(data.data)
    return response
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