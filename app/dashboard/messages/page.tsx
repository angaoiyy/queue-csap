import { Suspense } from "react";
import { listContactMessages } from "@/lib/actions/contact";
import { ContactMessagesInbox } from "@/components/contact-messages-inbox";

async function MessagesContent() {
  const messages = await listContactMessages();

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground">
          Messages sent through the landing page contact form. Only the super
          admin can see these.
        </p>
      </div>
      <ContactMessagesInbox messages={messages} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">Loading...</div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
