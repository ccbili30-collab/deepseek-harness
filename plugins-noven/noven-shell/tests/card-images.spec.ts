import { describe, expect, test } from 'vitest'
import { avatarImageId, coverImageId, identityImageId } from '../src/client/card-images.ts'

const card = {
  kind: 'CHARACTER',
  coverResourceId: 'cover-1',
  avatarResourceId: 'avatar-1',
  logoResourceId: 'logo-1',
}

describe('card image roles', () => {
  test('cover only resolves the cover', () => {
    expect(coverImageId(card)).toBe('cover-1')
    expect(coverImageId({ coverResourceId: null })).toBeNull()
  })

  test('a world identity only resolves its logo', () => {
    expect(identityImageId({ ...card, kind: 'WORLD' })).toBe('logo-1')
    expect(identityImageId({ ...card, kind: 'WORLD', logoResourceId: null })).toBeNull()
    expect(identityImageId({ ...card, kind: 'WORLD', logoResourceId: undefined })).toBeNull()
  })

  test('a character identity only resolves its avatar', () => {
    expect(identityImageId(card)).toBe('avatar-1')
    expect(identityImageId({ ...card, avatarResourceId: null })).toBeNull()
    expect(avatarImageId({ ...card, kind: 'WORLD' })).toBe('avatar-1')
    expect(avatarImageId({ ...card, avatarResourceId: null })).toBeNull()
  })
})
