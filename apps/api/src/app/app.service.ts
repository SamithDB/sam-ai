import { Injectable } from '@nestjs/common';

export type DemoItem = {
  id: number;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'archived';
};

@Injectable()
export class AppService {
  getItems(): DemoItem[] {
    return [
      {
        id: 1,
        name: 'Symbol master sync',
        description: 'Load the CSE security universe from allSecurityCode.',
        status: 'active',
      },
      {
        id: 2,
        name: 'Snapshot analysis',
        description: 'Generate a structured stock summary from companyInfoSummery.',
        status: 'active',
      },
      {
        id: 3,
        name: 'Historical research store',
        description: 'Persist daily bars, index context, and announcements for analysis.',
        status: 'draft',
      },
    ];
  }
}
