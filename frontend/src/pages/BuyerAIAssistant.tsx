import AssistantChat from "./AssistantChat";

function BuyerAIAssistant() {
  return (
    <AssistantChat
      dashboardPath="/buyer-dashboard"
      audience="buyer"
    />
  );
}

export default BuyerAIAssistant;