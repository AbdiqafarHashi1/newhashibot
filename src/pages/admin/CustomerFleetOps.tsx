import OnboardingOperations from './OnboardingOperations';
/** All fleet aliases use the same persisted customer/account operations authority. */
export default function CustomerFleetOps(){return <OnboardingOperations title="Customer fleet operations" purpose="Review account health across customers and request scoped stop or reconciliation actions."/>;}
