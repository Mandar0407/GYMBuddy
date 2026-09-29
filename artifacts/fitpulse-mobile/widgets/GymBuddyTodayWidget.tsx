import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type GymBuddyTodayWidgetProps = {
  initialized: boolean;
  /** Local calendar date of these values; kept visible so delayed timelines aren't mislabeled. */
  asOfDate: string;
  calories: number;
  calorieGoal: number;
  waterMl: number;
  waterGoalMl: number;
  sets: number;
  steps: number | null;
  stepGoal: number;
};

const GymBuddyTodayWidget = (
  props: GymBuddyTodayWidgetProps,
  environment: WidgetEnvironment,
) => {
  'widget';

  const titleColor = '#27231f';
  const mutedColor = '#827b73';
  const brandOrange = '#df7040';
  const brandGreen = '#28674f';

  if (!props.initialized) {
    return (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          containerBackground('#fffefa', 'widget'),
          widgetURL('fitpulse://log'),
          padding({ all: 16 }),
        ]}
      >
        <Text modifiers={[font({ weight: 'bold', size: 15 }), foregroundStyle(titleColor)]}>
          GYM Buddy
        </Text>
        {props.asOfDate ? (
          <Text modifiers={[font({ size: 10 }), foregroundStyle(mutedColor)]}>
            AS OF {props.asOfDate}
          </Text>
        ) : null}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(mutedColor)]}>
          Open the app to sync today&apos;s progress.
        </Text>
        <Spacer />
        <Text modifiers={[font({ weight: 'semibold', size: 11 }), foregroundStyle(brandOrange)]}>
          TAP TO OPEN TODAY
        </Text>
      </VStack>
    );
  }

  const calories = Math.max(0, props.calories ?? 0);
  const calorieGoal = Math.max(1, props.calorieGoal ?? 1);
  const waterMl = Math.max(0, props.waterMl ?? 0);
  const waterGoalMl = Math.max(1, props.waterGoalMl ?? 1);
  const sets = Math.max(0, props.sets ?? 0);
  const steps = typeof props.steps === 'number' ? Math.max(0, props.steps) : null;
  const stepGoal = Math.max(1, props.stepGoal ?? 1);

  return (
    <VStack
      alignment="leading"
      spacing={environment.widgetFamily === 'systemSmall' ? 6 : 9}
      modifiers={[
        containerBackground('#fffefa', 'widget'),
        widgetURL('fitpulse://log'),
        padding({ all: 16 }),
      ]}
    >
      <HStack spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 15 }), foregroundStyle(titleColor)]}>
          GYM Buddy
        </Text>
      </HStack>
      <Text modifiers={[font({ size: 10 }), foregroundStyle(mutedColor)]}>
        AS OF {props.asOfDate}
      </Text>
      <Text modifiers={[font({ weight: 'semibold', size: 12 }), foregroundStyle(mutedColor)]}>
        NUTRITION
      </Text>
      <Text modifiers={[font({ weight: 'bold', size: 22 }), foregroundStyle(titleColor)]}>
        {Math.round(calories).toLocaleString()} kcal
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(mutedColor)]}>
        {Math.round((calories / calorieGoal) * 100)}% of {Math.round(calorieGoal).toLocaleString()} kcal goal
      </Text>
      {environment.widgetFamily !== 'systemSmall' && (
        <HStack spacing={12}>
          <VStack alignment="leading" spacing={3}>
            <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle(brandGreen)]}>
              WATER
            </Text>
            <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(titleColor)]}>
              {Math.round(waterMl).toLocaleString()} / {Math.round(waterGoalMl).toLocaleString()} ml
            </Text>
          </VStack>
          <VStack alignment="leading" spacing={3}>
            <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle(brandGreen)]}>
              STRENGTH
            </Text>
            <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(titleColor)]}>
              {sets} {sets === 1 ? 'set' : 'sets'} logged
            </Text>
          </VStack>
        </HStack>
      )}
      {environment.widgetFamily === 'systemSmall' && (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(brandGreen)]}>
          {waterMl.toLocaleString()} ml water · {sets} {sets === 1 ? 'set' : 'sets'}
        </Text>
      )}
      {steps !== null && (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(mutedColor)]}>
          {steps.toLocaleString()} / {stepGoal.toLocaleString()} steps
        </Text>
      )}
      <Spacer />
      <Text modifiers={[font({ weight: 'bold', size: 10 }), foregroundStyle(brandOrange)]}>
        TAP TO OPEN TODAY &amp; LOG
      </Text>
    </VStack>
  );
};

export default createWidget('GymBuddyTodayWidget', GymBuddyTodayWidget);