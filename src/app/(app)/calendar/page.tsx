import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <div className="h-full">
      <CalendarView initialView="week" />
    </div>
  );
}
