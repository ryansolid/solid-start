"use server";

import { createSafeAction } from "solid-safe-action";
import { simulateDatabaseCall } from "~/lib/mock";
import { CreateTitle } from "~/lib/schema";
import { InputType, ReturnType } from "~/lib/types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const { title } = data;
  let item;

  try {
    // Mock database call;
    item = await simulateDatabaseCall({ title})

  } catch (error) {
    return { error: 'Failed to create!' };
  }


  return { data: item };
};

export const createTitle = createSafeAction(CreateTitle, handler);