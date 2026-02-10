# CURSOR QUICK REFERENCE - READ BEFORE EVERY FILE

## FILE OPERATIONS
✅ REPLACE existing files completely
❌ DON'T create duplicates with different names
✅ USE exact paths: `lib/services/team.ts`
❌ DON'T use variations: `lib/services/teamService.ts`

## DATABASE
✅ DROP tables first: `DROP TABLE IF EXISTS ... CASCADE`
❌ DON'T create without dropping first
✅ RUN entire migration as one transaction
❌ DON'T run table-by-table
✅ ALTER existing `profiles` table only (add columns) - DO NOT create or drop profiles

## IMPORTS
✅ USE: `import { supabase } from '@/lib/supabase'`
❌ DON'T: `import { supabase } from '../../../lib/supabase'`

## DESIGN
✅ White backgrounds for all content
✅ Gradient ONLY on CTAs
❌ DON'T create colorful cards
❌ DON'T use gradient as backgrounds

## CODE COMPLETENESS
✅ Complete implementations with error handling
❌ DON'T leave TODO comments
❌ DON'T create placeholder functions
❌ DON'T skip "boring parts"

## TYPES
✅ All variables properly typed
✅ Use interfaces from `lib/types.ts`
❌ DON'T use `any` unless specified
❌ DON'T create inline types

## THE ONE RULE
If the spec says X, do X. Not X+1, not 0.9X, exactly X.
