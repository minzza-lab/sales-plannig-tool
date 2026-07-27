export type CharacterGender = 'Female' | 'Male'
export type CharacterStatus = 'Active' | 'Draft' | 'Archived'

export interface Character {
  characterId: string
  modelCode: string
  name: string
  gender: CharacterGender
  age: number
  nationality: string
  height: number
  body: string
  face: string
  hair: string
  eyes: string
  eyebrows: string
  nose: string
  mouth: string
  skin: string
  defaultOutfit: string
  personality: string
  voice: string
  pose: string
  expression: string
  promptSeed: string
  version: string
  status: CharacterStatus
  imageUrl: string
  createdAt: string
  updatedAt: string
}

export type CharacterUpdate = Omit<Character, 'characterId' | 'modelCode' | 'version' | 'createdAt' | 'updatedAt'>
