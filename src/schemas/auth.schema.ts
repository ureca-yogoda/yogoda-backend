import { z } from "zod";

export const loginSchema = z.object({
    code: z.string(),
});

export interface RefreshResponse {
    accessToken: string;
}
