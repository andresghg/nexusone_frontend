import { db } from "@/db";

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
}

export const authRepository = new AuthRepository();