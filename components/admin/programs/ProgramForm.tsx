"use client";

import type { ReactNode } from "react";
import { ActionForm, Checkbox, MoneyField, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { createProgramAction, updateProgramAction } from "@/app/admin/(app)/programs/actions";

type Opt = { value: string; label: string };
type ProgramValues = {
  id?: string;
  name?: string;
  slug?: string;
  kind?: string;
  tagline?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  locationId?: string | null;
  arrivalInstructions?: string | null;
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  parentPresence?: string;
  bookingUnit?: string;
  bookingMode?: string;
  seriesMode?: string;
  defaultCapacity?: number | null;
  showRemaining?: boolean;
  lowAvailabilityThreshold?: number;
  waitlistEnabled?: boolean;
  waitlistAutoOffer?: boolean;
  offerWindowHours?: number;
  advanceBookingDays?: number | null;
  minNoticeHours?: number;
  cancellationDeadlineHours?: number | null;
  priceCents?: number | null;
  priceUnit?: string;
  depositCents?: number | null;
};

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-6 border-t border-ink/8 pt-6 first:border-0 first:pt-0 lg:grid-cols-[14rem_1fr]">
      <div>
        <legend className="text-[0.92rem] font-semibold text-ink">{title}</legend>
        {help ? <p className="mt-1 text-[0.8rem] text-ink-soft">{help}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

export function ProgramForm({
  program,
  options,
  locations,
  canEdit,
}: {
  program?: ProgramValues;
  options: { kinds: Opt[]; presence: Opt[]; units: Opt[]; modes: Opt[]; seriesModes: Opt[]; priceUnits: Opt[] };
  locations: Opt[];
  canEdit: boolean;
}) {
  const p = program ?? {};
  const editing = !!p.id;
  return (
    <ActionForm action={editing ? updateProgramAction : createProgramAction} className="space-y-6" submit={canEdit ? { label: editing ? "Save program" : "Create draft program" } : false}>
      {editing ? <input type="hidden" name="id" value={p.id} /> : null}
      <fieldset disabled={!canEdit} className="space-y-6">
        <Section title="Basics" help="What families see. New programs start as drafts.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Name" required defaultValue={p.name} />
            <TextField name="slug" label="URL slug" required defaultValue={p.slug} hint="Lowercase and hyphens, e.g. yalla-weekends." />
          </div>
          <SelectField name="kind" label="Program type" required defaultValue={p.kind ?? "drop_in"} options={options.kinds} />
          <TextField name="tagline" label="Tagline" defaultValue={p.tagline} />
          <TextArea name="description" label="Description" rows={4} defaultValue={p.description} />
          <TextField name="imageUrl" label="Public image URL" defaultValue={p.imageUrl} hint="A web address or a site path like /photos/garden.jpg." />
        </Section>

        <Section title="Location & arrival" help="Shown in confirmations and reminders.">
          <SelectField name="locationId" label="Location" defaultValue={p.locationId ?? ""} options={[{ value: "", label: "Not set" }, ...locations]} />
          <TextArea name="arrivalInstructions" label="Arrival instructions" rows={3} defaultValue={p.arrivalInstructions} />
        </Section>

        <Section title="Who it’s for" help="Each program sets its own rules — nothing is assumed from Club Yalla.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="minAgeMonths" label="Minimum age (months)" type="number" defaultValue={p.minAgeMonths} />
            <TextField name="maxAgeMonths" label="Maximum age (months)" type="number" defaultValue={p.maxAgeMonths} hint="Ages are checked on each session date." />
          </div>
          <SelectField name="parentPresence" label="Parent presence" required defaultValue={p.parentPresence ?? "not_required"} options={options.presence} />
        </Section>

        <Section title="How booking works">
          <SelectField name="bookingMode" label="Booking mode" required defaultValue={p.bookingMode ?? "instant"} options={options.modes} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="bookingUnit" label="Bookings are" required defaultValue={p.bookingUnit ?? "per_child"} options={options.units} hint="Per child: two siblings use two spots." />
            <SelectField name="seriesMode" label="Dates within a series" required defaultValue={p.seriesMode ?? "individual"} options={options.seriesModes} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="advanceBookingDays" label="Book up to (days ahead)" type="number" defaultValue={p.advanceBookingDays} hint="Blank = no limit." />
            <TextField name="minNoticeHours" label="Minimum notice (hours)" type="number" defaultValue={p.minNoticeHours ?? 0} />
            <TextField name="cancellationDeadlineHours" label="Cancellation deadline (hours before)" type="number" defaultValue={p.cancellationDeadlineHours} />
          </div>
        </Section>

        <Section title="Capacity & availability" help="Remaining-spot messaging always reflects real, bookable inventory.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="defaultCapacity" label="Default session capacity" type="number" defaultValue={p.defaultCapacity} hint="Pre-fills new sessions; each session keeps its own capacity." />
            <TextField name="lowAvailabilityThreshold" label="Show “few spots left” at or below" type="number" defaultValue={p.lowAvailabilityThreshold ?? 2} />
          </div>
          <Checkbox name="showRemaining" label="Show the number of remaining spots publicly" defaultChecked={p.showRemaining ?? true} hint="When off, families see “Few spots left” without a number." />
        </Section>

        <Section title="Waitlist">
          <Checkbox name="waitlistEnabled" label="Offer a waitlist when a session is full" defaultChecked={p.waitlistEnabled ?? true} />
          <Checkbox name="waitlistAutoOffer" label="Automatically offer freed spots to the next eligible family" defaultChecked={p.waitlistAutoOffer ?? false} hint="Offers reserve the spot for the window below; nothing is charged until the family accepts and pays." />
          <TextField name="offerWindowHours" label="Offer acceptance window (hours)" type="number" defaultValue={p.offerWindowHours ?? 24} className="sm:max-w-xs" />
        </Section>

        <Section title="Pricing" help="Use the price table below for cohort or day-length rates. Price changes apply to new bookings only.">
          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField name="priceCents" label="Base price" defaultValue={p.priceCents} />
            <SelectField name="priceUnit" label="Charged" defaultValue={p.priceUnit ?? "session"} options={options.priceUnits} />
            <MoneyField name="depositCents" label="Deposit (optional)" defaultValue={p.depositCents} hint="Only used if deposits are enabled in Settings." />
          </div>
        </Section>
      </fieldset>
    </ActionForm>
  );
}
