declare module '@qweeps/hyperframes-adapter' {
 import type {FrameAdapter,CreateGSAPFrameAdapterOptions} from '@hyperframes/core';
 export type {GSAPTimelineLike} from '@hyperframes/core';
 export function createGSAPFrameAdapter(options:CreateGSAPFrameAdapterOptions):FrameAdapter;
}
