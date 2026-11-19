import { profileRepository } from './ProfileRepository'

class ProfileService {
  async getByUserId(userId: string) {
    return profileRepository.findByUserId(userId)
  }
}

export const profileService = new ProfileService()