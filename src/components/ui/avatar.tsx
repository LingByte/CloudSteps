"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "./utils";

function hashStringToHue(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function getInitials(name?: string) {
  const n = (name ?? "").trim();
  if (!n) return "";

  const parts = n.split(/\s+/).filter(Boolean);
  const joined = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
  const compact = joined.replace(/\s+/g, "");
  return compact.slice(0, 2).toUpperCase();
}

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className,
      )}
      {...props}
    />
  );
}

type SmartAvatarProps = {
  name?: string;
  src?: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

function SmartAvatar({
  name,
  src,
  alt,
  className,
  imageClassName,
  fallbackClassName,
}: SmartAvatarProps) {
  const initials = getInitials(name);
  const hue = hashStringToHue(name ?? "user");
  const background = `hsl(${hue} 70% 45%)`;

  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={alt ?? name} className={imageClassName} /> : null}
      <AvatarFallback
        className={cn(
          "text-white font-semibold",
          fallbackClassName,
        )}
        style={{ backgroundColor: background }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export { Avatar, AvatarImage, AvatarFallback, SmartAvatar };
