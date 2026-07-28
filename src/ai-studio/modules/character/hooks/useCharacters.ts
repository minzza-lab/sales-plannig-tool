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

  useEffect(() => {
    const handleUpdated = () => void refresh()
    window.addEventListener('ai-studio-characters-updated', handleUpdated)
    return () => window.removeEventListener('ai-studio-characters-updated', handleUpdated)
  }, [refresh])

  const createVersion = useCallback(async (characterId: string, update: CharacterUpdate) => {
    const saved = await service.createVersion(characterId, update)
    await refresh()
    window.dispatchEvent(new Event('ai-studio-characters-updated'))
    return saved
  }, [refresh])

  const createCharacter = useCallback(async (update: CharacterUpdate) => {
    const saved = await service.createCharacter(update)
    await refresh()
    window.dispatchEvent(new Event('ai-studio-characters-updated'))
    return saved
  }, [refresh])

  return useMemo(
    () => ({ characters, isLoading, createVersion, createCharacter }),
    [characters, isLoading, createVersion, createCharacter],
  )
}
