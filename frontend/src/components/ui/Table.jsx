import React from "react";

export function Table({ className = "", children, ...props }) {
  return (
    <div className="ui-table-wrap">
      <table className={["ui-table", className].filter(Boolean).join(" ")} {...props}>
        {children}
      </table>
    </div>
  );
}

export default Table;
