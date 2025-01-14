import { z } from "zod";


import { ActionState } from "solid-safe-action";
import { CreateTitle } from "./schema";

export type InputType = z.infer<typeof CreateTitle>;
export type ReturnType = ActionState<InputType, { title: string; }>;