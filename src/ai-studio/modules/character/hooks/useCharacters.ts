import { useCallback, useEffect, useMemo, useState } from 'react'
import { JsonCharacterRepository } from '../repositories/CharacterRepository'
import { CharacterService } from '../services/CharacterService'
import type { Character, CharacterUpdate } from '../types/character'

const service = new CharacterService(new JsonCharacterRepository())

export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setCharacters(await service.list())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void service.list().then((items) => {
      if (active) {
        setCharacters(items)
        setIsLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const createVersion = useCallback(async (characterId: string, update: CharacterUpdate) => {
    const saved = await service.createVersion(characterId, update)
    await refresh()
    return saved
  }, [refresh])

  return useMemo(() => ({ characters, isLoading, createVersion }), [characters, isLoading, createVersion])
}
