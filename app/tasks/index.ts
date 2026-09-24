import type { ComponentType } from "react";
import { CartCoupon, NotesAppend, SignupForm } from "./forms.tsx";
import { ContactStar, DeleteDraftModal, InvoicePaid, TodoReorder } from "./lists.tsx";
import { DatePicker, NestedMenu, SettingsTabs, VolumeSlider, WizardTeam } from "./widgets.tsx";

/** Task id → page. The ids, prompts and expected states live in tasks/tasks.json. */
export const TASKS: Record<string, { title: string; component: ComponentType }> = {
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
