import { z } from "zod";

const APP_ROLES = ["user", "vendor", "admin"] as const;
const SECTIONS = ["shop", "dashboard"] as const;

export const menuItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80, "Title too long"),
  icon: z.string().trim().max(40).optional().nullable(),
  route: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || v.startsWith("/") || /^https?:\/\//.test(v), {
      message: "Route must start with / or be a full URL",
    })
    .optional()
    .nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  role_access: z.array(z.enum(APP_ROLES)).default([]),
  order_index: z.number().int().min(0).max(10000).default(0),
  is_active: z.boolean().default(true),
  section: z.enum(SECTIONS).default("shop"),
  badge_key: z.string().trim().max(60).optional().nullable(),
});

export type MenuItemFormData = z.infer<typeof menuItemSchema>;
