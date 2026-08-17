import type { PropsWithChildren, ReactNode } from "react";

interface Props {
  title?: ReactNode;
  right?: ReactNode;
  href?: string;
}

export function Card({ title, right, href, children }: PropsWithChildren<Props>) {
  const inner = (
    <>
      {title !== undefined && (
        <h2 style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{title}</span>
          {right && <span className="muted" style={{ fontSize: 11 }}>{right}</span>}
        </h2>
      )}
      {children}
    </>
  );
  if (href) {
    return (
      <a
        className="card"
        href={href}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        {inner}
      </a>
    );
  }
  return <div className="card">{inner}</div>;
}
