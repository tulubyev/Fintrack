import { Construction } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageHeader } from '@/components/layout/PageHeader';

/** Раздел уже есть в навигации, а экран появится в своём эпике. */
export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty className="border bg-card" data-testid="coming-soon">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Construction /></EmptyMedia>
          <EmptyTitle>Раздел в разработке</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
