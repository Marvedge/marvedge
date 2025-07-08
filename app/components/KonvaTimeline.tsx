// 'use client'
// import { KonvaTimeline } from '@melfore/konva-timeline'

// interface KonvaProps{
//     start : number,
//     end : number
// }

// export default function KonvaTimeLineCmp({start , end} : KonvaProps) {
//     return (
//         <KonvaTimeline
//             range={{
//                 end: end,
//                 start: start
//             }}
//             resources={[
//                 {
//                     color: '#f00bda',
//                     id: '1',
//                     label: 'Resource #1'
//                 },
//             ]}
//             tasks={[
//                 {
//                     id: '1',
//                     label : 'task 1',
//                     resourceId : '1',
//                     time:{
//                         start : start,
//                         end: end
//                     }
//                 }
//             ]}
//         />
//     )
// }