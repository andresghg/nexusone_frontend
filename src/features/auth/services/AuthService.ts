
import { authRepository, type IAuthRepository } from "./AuthRepository";
import type { SignUpInput } from "../schemas/authSchema";

class AuthService {
  constructor(private authRepository: IAuthRepository) {}

  async register(credentials: SignUpInput) {
    const { name, email, password } = credentials;

    const user = await this.authRepository.userExist(email);
    if(user) {
      return {
        error: 'Este e-mail ya esta registrado',
        success: ''
      }
    }

    // Manejar el registro
    await this.authRepository.register({ name, email, password });

    return {
      error: '',
      success: 'Cuenta Creada Correctamente, revisa tu e-mail'
    };
  }
}

export const authService = new AuthService(authRepository);
