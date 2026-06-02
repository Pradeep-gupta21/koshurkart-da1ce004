## Promote koshurkartofficial@gmail.com to admin

Account found in `auth.users`:
- User ID: `2da6bf7a-d402-4287-863b-cd45671668c6`
- Created: 2026-06-02

### Action
Run a migration that inserts an `admin` role row into `public.user_roles` for this user (idempotent — won't duplicate if already present).

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('2da6bf7a-d402-4287-863b-cd45671668c6', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

### After running
Sign out and sign back in so the session picks up the new role, then `/admin` routes will be accessible.