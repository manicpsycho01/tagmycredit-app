import { BookPage } from "@/components/lines/BookPage";
export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  return <BookPage side="GIVEN" searchParams={searchParams} />;
}
