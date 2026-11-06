import { avatarStyle, initials } from "./format";

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <i className={"jc-av" + (small ? " s" : "")} style={avatarStyle(name)} aria-hidden="true">
      {initials(name)}
    </i>
  );
}
