import { useLayoutEffect, useState } from 'react'
import { WizardHighlight, useWizardHighlight } from '@/components/onboarding/WizardTarget'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIReplySetting } from '../AutoReplySettings/components/AIReplySetting'
import { BlocklistManager } from '../AutoReplySettings/components/BlocklistManager'
import { HideUsernameSetting } from '../AutoReplySettings/components/HideUsernameSetting'
import { KeywordReplySetting } from '../AutoReplySettings/components/KeywordReplySetting'
import { ListeningSourceSetting } from '../AutoReplySettings/components/ListeningSourceSetting'

export function AutoReplySettingsPanel() {
  const wizard = useWizardHighlight()
  const [replyMode, setReplyMode] = useState('keyword')

  useLayoutEffect(() => {
    if (wizard?.currentTargetId === 'auto-reply-keyword') {
      setReplyMode('keyword')
    }
  }, [wizard?.currentTargetId])

  return (
    <Card>
      <CardHeader>
        <CardTitle>回复规则</CardTitle>
        <CardDescription>
          观众评论里出现你设的词，就自动回公屏。不会回复你自己发的内容。改完会自动保存。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <WizardHighlight targetId="auto-reply-listening" className="p-3 -m-1">
          <ListeningSourceSetting />
        </WizardHighlight>
        <Separator />
        <HideUsernameSetting />
        <Separator />
        <div className="space-y-4">
          <Tabs value={replyMode} onValueChange={setReplyMode}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">自动回复评论设置</h3>
              <TabsList>
                <TabsTrigger value="keyword">关键词回复</TabsTrigger>
                <TabsTrigger value="ai">AI回复</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="keyword" forceMount className="space-y-4 data-[state=inactive]:hidden">
              <WizardHighlight targetId="auto-reply-keyword" className="p-3 -m-1">
                <KeywordReplySetting />
              </WizardHighlight>
            </TabsContent>
            <TabsContent value="ai" forceMount className="space-y-4 data-[state=inactive]:hidden">
              <AIReplySetting />
            </TabsContent>
          </Tabs>
        </div>

        <Separator />
        <BlocklistManager />
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">改完会自动保存，不用点保存</p>
      </CardFooter>
    </Card>
  )
}
