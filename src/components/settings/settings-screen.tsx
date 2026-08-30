"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bell, Hash, KeyRound, Plus, Trash2, User as UserIcon, Upload } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { browserTimezone } from "@/lib/client/datetime";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/types";
import type { PublicUser } from "@/server/users";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";

const KIND_LABELS: Record<NotificationKind, string> = {
  TASK_STARTING: "Task starting soon",
  TASK_OVERDUE: "Task overdue",
  TASK_ASSIGNED: "Task assigned to me",
  MENTION: "Someone mentions me",
  COMMENT: "Comments on my tasks",
  DEADLINE: "Upcoming deadline",
};

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function SettingsScreen() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState(params.get("tab") ?? "profile");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">
            <UserIcon className="size-3.5" /> Profile
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="size-3.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Hash className="size-3.5" /> Tags
          </TabsTrigger>
          <TabsTrigger value="security">
            <KeyRound className="size-3.5" /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 outline-none">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4 outline-none">
          <NotificationSection />
        </TabsContent>
        <TabsContent value="tags" className="mt-4 outline-none">
          <TagSection />
        </TabsContent>
        <TabsContent value="security" className="mt-4 outline-none">
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useApp();
  const [name, setName] = React.useState(user.name);
  const [username, setUsername] = React.useState(user.username);
  const [bio, setBio] = React.useState(user.bio ?? "");
  const [timezone, setTimezone] = React.useState(user.timezone);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const timezoneOptions = React.useMemo(() => {
    const detected = browserTimezone();
    return [...new Set([user.timezone, detected, ...TIMEZONES])];
  }, [user.timezone]);

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.patch<{ user: PublicUser }>("/api/users/me", {
        name,
        username,
        bio: bio || null,
        timezone,
      });
      setUser(result.user);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File): Promise<void> => {
    const form = new FormData();
    form.set("file", file);
    try {
      const result = await api.upload<{ user: PublicUser }>("/api/users/me/avatar", form);
      setUser(result.user);
      toast.success("Avatar updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the image");
    }
  };

  const removeAvatar = async (): Promise<void> => {
    try {
      const result = await api.delete<{ user: PublicUser }>("/api/users/me/avatar");
      setUser(result.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the avatar");
    }
  };

  return (
    <form onSubmit={save} className="fd-panel space-y-4 p-4">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} src={user.avatar} size="xl" />
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload /> Upload
            </Button>
            {user.avatar ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void removeAvatar()}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or GIF up to 1.5MB.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Name</Label>
          <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-username">Username</Label>
          <Input
            id="settings-username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="settings-email">Email</Label>
        <Input id="settings-email" value={user.email} readOnly disabled />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="settings-timezone">Timezone</Label>
        <NativeSelect
          id="settings-timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {timezoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </NativeSelect>
        <p className="text-[11px] text-muted-foreground">
          Every date is stored in UTC and rendered in this zone — not your browser&apos;s.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="settings-bio">Bio</Label>
        <Textarea
          id="settings-bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={400}
          placeholder="What are you building?"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function NotificationSection() {
  const { user, setUser } = useApp();
  const prefs = user.notificationPrefs;
  const [saving, setSaving] = React.useState(false);

  const update = async (patch: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    try {
      const result = await api.patch<{ user: PublicUser }>("/api/users/me/notifications", patch);
      setUser(result.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fd-panel divide-y divide-border">
      <div className="space-y-3 p-4">
        <h2 className="text-[13px] font-semibold">Channels</h2>
        <Row label="In-app notifications" description="Shown in the bell menu.">
          <Switch
            checked={prefs.channels.inApp}
            disabled={saving}
            onCheckedChange={(checked) => void update({ channels: { inApp: checked } })}
          />
        </Row>
        <Row label="Push notifications" description="Delivered to devices you have enabled.">
          <Switch
            checked={prefs.channels.push}
            disabled={saving}
            onCheckedChange={(checked) => void update({ channels: { push: checked } })}
          />
        </Row>
      </div>

      <div className="space-y-3 p-4">
        <h2 className="text-[13px] font-semibold">What to notify me about</h2>
        {NOTIFICATION_KINDS.map((kind) => (
          <Row key={kind} label={KIND_LABELS[kind]}>
            <Switch
              checked={prefs.kinds[kind] !== false}
              disabled={saving}
              onCheckedChange={(checked) => void update({ kinds: { [kind]: checked } })}
            />
          </Row>
        ))}
      </div>

      <div className="space-y-3 p-4">
        <h2 className="text-[13px] font-semibold">Timing</h2>
        <Row label="Quiet hours" description="Push is held back inside this window.">
          <Switch
            checked={prefs.quietHours.enabled}
            disabled={saving}
            onCheckedChange={(checked) => void update({ quietHours: { enabled: checked } })}
          />
        </Row>
        {prefs.quietHours.enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="quiet-start">From</Label>
              <NativeSelect
                id="quiet-start"
                value={String(prefs.quietHours.startHour)}
                onChange={(event) => void update({ quietHours: { startHour: Number(event.target.value) } })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quiet-end">Until</Label>
              <NativeSelect
                id="quiet-end"
                value={String(prefs.quietHours.endHour)}
                onChange={(event) => void update({ quietHours: { endHour: Number(event.target.value) } })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TagSection() {
  const { tags, workspaceId, refreshTags } = useApp();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#6366f1");
  const [saving, setSaving] = React.useState(false);

  const create = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/tags", { workspaceId, name: name.trim().toLowerCase(), color });
      setName("");
      await refreshTags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the tag");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    try {
      await api.delete(`/api/tags/${id}`);
      await refreshTags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the tag");
    }
  };

  return (
    <div className="fd-panel divide-y divide-border">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="tag-name">New tag</Label>
          <Input
            id="tag-name"
            value={name}
            onChange={(event) => setName(event.target.value.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase())}
            placeholder="backend"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tag-color">Colour</Label>
          <input
            id="tag-color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-14 cursor-pointer rounded-md border border-input bg-surface p-1"
          />
        </div>
        <Button type="submit" loading={saving} disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>

      <div className="p-4">
        {tags.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No tags yet. Tags make filtering fast.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1"
              >
                <span className="size-2 rounded-full" style={{ background: tag.color }} />
                <span className="text-[12px] font-medium">#{tag.name}</span>
                <button
                  type="button"
                  onClick={() => void remove(tag.id)}
                  aria-label={`Delete tag ${tag.name}`}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (newPassword !== confirm) {
      toast.error("Those passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success("Password changed — other devices were signed out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="fd-panel space-y-4 p-4">
      <div>
        <h2 className="text-[13px] font-semibold">Change password</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Changing it signs out every other session. This device stays signed in.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
