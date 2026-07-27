import charactersData from '../../../data/characters.json'
import type { Character } from '../types/character'

const STORAGE_KEY = 'ai-studio.characters.v2'

export interface CharacterRepository {
  findAll(): Promise<Character[]>
  findById(characterId: string): Promise<Character | undefined>
  save(character: Character): Promise<Character>
  findVersions(characterId: string): Promise<Character[]>
}

export class JsonCharacterRepository implements CharacterRepository {
  private read(): Character[] {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return charactersData as Character[]

    try {
      return JSON.parse(stored) as Character[]
    } catch {
      return charactersData as Character[]
    }
  }

  private write(characters: Character[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(characters))
  }

  async findAll() {
    const latestById = new Map<string, Character>()
    this.read().forEach((character) => {
      const current = latestById.get(character.characterId)
      if (!current || current.updatedAt < character.updatedAt) latestById.set(character.characterId, character)
    })
    return Array.from(latestById.values())
  }

  async findById(characterId: string) {
    const versions = await this.findVersions(characterId)
    return versions[0]
  }

  async save(character: Character) {
    this.write([...this.read(), character])
    return character
  }

  async findVersions(characterId: string) {
    return this.read()
      .filter((character) => character.characterId === characterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}
