export const simulateDatabaseCall = (data: { title: string }): Promise<{ title: string }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ title: data.title });
      }, 1000);
    });
  };