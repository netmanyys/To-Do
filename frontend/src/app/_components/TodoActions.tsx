"use client";

import React from "react";

export function TodoActions(props: {
  id: number;
  done: boolean;
  priority: string;
}) {
  const { id, done, priority } = props;

  return (
    <div className="actions actions-3">
      <form method="post" action={`/todos/${id}/toggle`}>
        <button className="btn-small btn-ghost" type="submit">
          {done ? "Undo" : "Done"}
        </button>
      </form>

      <form method="post" action={`/todos/${id}/priority`}>
        <select
          className="btn-small"
          name="priority"
          defaultValue={priority}
          onChange={(e) => {
            // submit immediately after selection
            e.currentTarget.form?.requestSubmit();
          }}
        >
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </form>

      <form method="post" action={`/todos/${id}/delete`}>
        <button className="btn-small btn-danger" type="submit">
          Delete
        </button>
      </form>
    </div>
  );
}
