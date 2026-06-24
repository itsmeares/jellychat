import type { MessageGroupModel } from "../types";
import { formatMessageTime } from "../runtime/util";

type Props = {
  group: MessageGroupModel;
};

export function MessageGroup({ group }: Props) {
  return (
    <div className="jellyChatMessageGroup" data-jellychat-group-key={group.key}>
      <div className="jellyChatMessageMeta">
        <span className="jellyChatMessageAuthor">{group.userName}</span>
        <span>{formatMessageTime(group)}</span>
      </div>
      <div className="jellyChatMessageStack">
        {group.messages.map((message) => (
          <div key={message.eventKey} className="jellyChatMessage" data-jellychat-message-key={message.eventKey}>
            <div className="jellyChatMessageBody">{message.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
