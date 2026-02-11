# POST /dashboard/team – nincs API route

- **app/api/dashboard/team/route.ts** – NEM LÉTEZIK
- **app/api/team/route.ts** – NEM LÉTEZIK

A `POST http://localhost:3000/dashboard/team` a Next.js **server action** hívás: a kliens a `/dashboard/team` oldalról meghívja a `getTeamHierarchy(orgId)` actiont, a keretrendszer pedig POST-ként küldi a kérést.

## Amit a kliens hív (team page)

Fájl: **app/dashboard/team/page.tsx** (kb. 39–49. sor)

```ts
async function loadData() {
  try {
    const orgId = await getOrganisationIdForCurrentUser()
    if (!orgId) return
    setOrganisationId(orgId)
    const [membersData, rolesData, venuesData, settings, hierarchy] = await Promise.all([
      getTeamMembers(orgId),
      getRolesByOrg(orgId),
      getVenuesByOrg(orgId),
      getOrganisationSettings(orgId),
      getTeamHierarchy(orgId).catch(() => ({ members: [], chain: [] })),  // <-- ez a server action, POST /dashboard/team
    ])
    // ...
  }
}
```

## A tényleges handler (szerveren fut, itt jöhet a 500)

Fájl: **app/actions/hierarchy.ts** – függvény: `getTeamHierarchy`

Lásd: **app/actions/hierarchy.ts** 69–123. sor (getTeamHierarchy).

A 500-ast ez a függvény dobja, ha pl. `membersError` van vagy a `createClient()`/auth hibázik.
