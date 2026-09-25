import type { ComponentType } from "react";
import { CartCoupon, NotesAppend, SignupForm } from "./forms.tsx";
import { ContactStar, DeleteDraftModal, InvoicePaid, TodoReorder } from "./lists.tsx";
import { DatePicker, NestedMenu, SettingsTabs, VolumeSlider, WizardTeam } from "./widgets.tsx";

export type TaskPage = { title: string; component: ComponentType };

/** The basic suite: task id → page. The ids, prompts and expected states live in tasks/tasks.json. */
const BASIC: Record<string, TaskPage> = {
  "signup-form": { title: "Sign up", component: SignupForm },
  "notes-append": { title: "Meeting notes", component: NotesAppend },
  "cart-coupon": { title: "Cart", component: CartCoupon },
  "invoice-paid": { title: "Invoices", component: InvoicePaid },
  "contact-star": { title: "Contacts", component: ContactStar },
  "delete-draft": { title: "Drafts", component: DeleteDraftModal },
  "todo-reorder": { title: "Today", component: TodoReorder },
  "settings-tabs": { title: "Settings", component: SettingsTabs },
  "wizard-team": { title: "Upgrade", component: WizardTeam },
  "date-picker": { title: "Delivery", component: DatePicker },
  "volume-slider": { title: "Sound", component: VolumeSlider },
  "nested-menu": { title: "Report", component: NestedMenu },
};

/** The hard suite: each module under ./hard exports its own TASKS; their specs live in tasks/hard/*.json. */
const HARD = import.meta.glob<{ TASKS: Record<string, TaskPage> }>("./hard/*.tsx", { eager: true });

export const TASKS: Record<string, TaskPage> = Object.assign({}, BASIC, ...Object.values(HARD).map((m) => m.TASKS));
