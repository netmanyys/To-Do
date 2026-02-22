"use client";

import React from "react";

export function ThemeSelect(props: { theme: "dark" | "light" }) {
  return (
    <form method="post" action="/theme" style={{ width: "100%" }}>
      <input type="hidden" name="next" value="/" />
      <select
        className="btn-small theme-select"
        name="theme"
        defaultValue={props.theme}
        onChange={(e) => {
          e.currentTarget.form?.requestSubmit();
        }}
      >
        <option value="dark">Dark blue</option>
        <option value="light">Light</option>
      </select>
    </form>
  );
}
