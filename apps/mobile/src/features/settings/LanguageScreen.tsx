import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';

export function LanguageScreen() {
  return (
    <Screen>
      <EmptyState
        title="In progress"
        body="The app is English only for now. This is where other languages will go."
      />
    </Screen>
  );
}
