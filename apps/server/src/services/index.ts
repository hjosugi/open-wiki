/**
 * Composition root for the service layer. Everything the HTTP layer needs is
 * built here from a single `DB` dependency and passed down explicitly.
 */
import type { DB } from '../db/client.ts'
import { createPageService, type PageService } from './pages.ts'
import { createSearchService, type SearchService } from './search.ts'
import { createUserService, type UserService } from './users.ts'
import { createAssetService, type AssetService } from './assets.ts'
import { createAdminService, type AdminService } from './admin.ts'

export interface Services {
  readonly pages: PageService
  readonly search: SearchService
  readonly users: UserService
  readonly assets: AssetService
  readonly admin: AdminService
}

export const createServices = (db: DB): Services => ({
  pages: createPageService(db),
  search: createSearchService(db),
  users: createUserService(db),
  assets: createAssetService(db),
  admin: createAdminService(db),
})

export type { PageService, SearchService, UserService, AssetService, AdminService }
