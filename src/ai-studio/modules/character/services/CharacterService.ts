import type { CharacterRepository } from '../repositories/CharacterRepository'
import type { Character, CharacterUpdate } from '../types/character'

export class CharacterService {
  private readonly repository: CharacterRepository

  constructor(repository: CharacterRepository) {
    this.repository = repository
  }

  list() {
    return this.repository.findAll()
  }

  getVersions(characterId: string) {
    return this.repository.findVersions(characterId)
  }

  async createCharacter(update: CharacterUpdate): Promise<Character> {
    const characters = await this.repository.findAll()
    const genderCode = update.gender === 'Female' ? 'F' : 'M'
    const sameGenderCount = characters.filter((character) => character.gender === update.gender).length + 1
    const suffix = String(sameGenderCount).padStart(3, '0')
    const now = new Date().toISOString()
    const character: Character = {
      ...update,
      characterId: `CHAR_${genderCode}${suffix}`,
      modelCode: `AV-${genderCode}-${suffix}`,
      version: '1.0',
      createdAt: now,
      updatedAt: now,
    }
    return this.repository.save(character)
  }

  async createVersion(characterId: string, update: CharacterUpdate): Promise<Character> {
    const current = await this.repository.findById(characterId)
    if (!current) throw new Error('캐릭터를 찾을 수 없습니다.')

    const [major, minor] = current.version.split('.').map(Number)
    const nextVersion = `${major}.${minor + 1}`
    const next: Character = {
      ...current,
      ...update,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    }
    return this.repository.save(next)
  }
}
