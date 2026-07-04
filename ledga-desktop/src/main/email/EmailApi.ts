export interface EmailMessageHeader {
  emailId: string;
  fromAddr: string;
  timestamp: number;
  contentForHash: string;
}

export interface EmailMessageListItem {
  id: string;
}

export interface EmailApi {
  listMessages(startDate: Date, endDate: Date): Promise<EmailMessageListItem[]>;
  getMessageContent(providerMessageId: string): Promise<string>;
}
