import { db } from "@/db";
import type { SignUpInput, SignInInput } from "../schemas/authSchema"
import { createClient } from "@/lib/supabase/server"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export interface IAuthRepository {
  userExist(email: string): Promise<{ id: string } | undefined>;
}

class AuthRepository implements IAuthRepository {
  async userExist(email: string) {
    return await db.query.authUsers.findFirst({
      columns: { id: true },
      where: { email: email.trim().toLowerCase() },
    });
  }

  async register({ name, email, password }: Pick<SignUpInput, "name" | "email" | "password">) {
    const supabase = await createClient();
    return supabase.auth.signUp({
      email,
      password,
      options: {
        // El trigger handle_new_user copia full_name a profiles.
        data: { full_name: name },
        emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard`,
      },
    });
  }

  async login({ email, password }: SignInInput) {
    const supabase = await createClient();
    return supabase.auth.signInWithPassword({ email, password });
  }

  async logout() {
    const supabase = await createClient();
    return supabase.auth.signOut();
  }

  async updatePassword(password: string) {
    const supabase = await createClient();
    return supabase.auth.updateUser({ password });
  }

}



export const authRepository = new AuthRepository();