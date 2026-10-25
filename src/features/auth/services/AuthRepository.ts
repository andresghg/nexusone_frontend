/* import { db } from "@/src/db";
import { User } from "../types/auth.types";

export interface IAuthRepository {
    userExist(email: string): Promise<User | undefined>;
}

class AuthRepository implements IAuthRepository {
    async userExist(email: string) {
        return await db.query.users.findFirst({
            where: {
                email
            }
        })
        
    }
}

export const authRepository = new AuthRepository();
