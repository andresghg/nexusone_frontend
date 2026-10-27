
import { authRepository, type IAuthRepository } from "./AuthRepository";
import type { SignUpInput, SignInInput } from "../schemas/authSchema";

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
    await authRepository.register({ name, email, password})

    return {
      error: '',
      success: 'Cuenta Creada Correctamente, revisa tu e-mail'
    };
  }

  async login(credentials: SignInInput) {
    const { email, password } = credentials;

    const user = await this.authRepository.userExist(email);
    if(!user) {
      return {
        error: 'Este e-mail no esta registrado',
        success: ''
      }
    }

    const { error } = await authRepository.login({ email, password });
    if(error) {
      return {
        error: 'Credenciales Invalidas',
        success: ''
      }
    }
    
    return {
      error: '',
      success: 'Sesion Iniciada Correctamente'
    }
  }

  async logout() {
    await authRepository.logout();
  }
}

export const authService = new AuthService(authRepository);
