import { getInitials, cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

export function Avatar({ name, color = "#6366F1", size = "md", className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        SIZE_CLASSES[size],
        className
      )}
      style={{ backgroundColor: color }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}

interface AvatarStackProps {
  people: { name: string; avatarColor: string }[];
  max?: number;
  size?: AvatarProps["size"];
}

export function AvatarStack({ people, max = 3, size = "sm" }: AvatarStackProps) {
  const visible = people.slice(0, max);
  const remaining = people.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((person, index) => (
        <Avatar key={`${person.name}-${index}`} name={person.name} color={person.avatarColor} size={size} />
      ))}
      {remaining > 0 && (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
          +{remaining}
        </span>
      )}
    </div>
  );
}
