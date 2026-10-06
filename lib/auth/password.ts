import { z } from 'zod';

/**
 * The rules for choosing a password.
 *
 * Separate from the action so they can be tested without standing up a request:
 * the confirmation check in particular is the kind of thing that works until
 * someone reorders the fields.
 *
 * Length only, deliberately. Composition rules — a capital, a digit, a symbol —
 * push people towards Passw0rd! and away from a long memorable phrase, and
 * Supabase applies its own strength check on top of this one.
 */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Passwords are at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Those two passwords do not match.',
    path: ['confirm'],
  });

export type NewPassword = z.infer<typeof newPasswordSchema>;
