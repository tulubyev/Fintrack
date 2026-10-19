import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { PageHeader } from '@/components/layout/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Страница не найдена" />
      <Empty className="border bg-card" data-testid="not-found">
        <EmptyHeader>
          <EmptyTitle>Такой страницы нет</EmptyTitle>
          <EmptyDescription>Возможно, ссылка устарела или в адресе опечатка.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild><Link href="/">На главную</Link></Button>
        </EmptyContent>
      </Empty>
    </>
  );
}
