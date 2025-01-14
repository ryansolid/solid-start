'use client'

import { useSafeAction } from "solid-safe-action";
import { createTitle } from "~/actions/index";
import "./ActionButton.css";
const ActionButton = () => {
  const { execute, isLoading, } = useSafeAction(createTitle, {
    onSuccess: (data) => {
      window.alert(`Success: ${JSON.stringify(data, null, 2)}`);
    },
    onError: (error) => {
      window.alert("Error: " + error);
    }
  });

  const onClick = (title: string) => {
    execute({ title });
  };

  return ( 
    <button class="actionbtn" disabled={isLoading()} onClick={() => onClick("Button")}>
      Click to make a database call using server action
    </button>
  );
};

export default ActionButton